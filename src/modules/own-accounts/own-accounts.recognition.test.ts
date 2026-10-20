// Feature 62 `own-accounts`: the recognition of own movements, pure (R5–R8, R10).
//
// 🔒 Everything here is invented: the holder «Ana Pérez Gil», the other person
// «Lucía Pérez Sanz», the concepts and the account names. Bank names alone are
// fine (docs/conventions.md §Tests).
import { describe, expect, it } from 'vitest'

import {
  normalizeOwnText,
  resolveOwnership,
  type OwnAccountForMatch,
  type OwnershipInput,
} from './own-accounts.recognition.js'

function movement(id: number, description: string, extra: Partial<OwnershipInput> = {}) {
  return {
    id,
    description,
    transferId: null,
    excludedFromTotals: false,
    ownershipDecision: null,
    ...extra,
  } satisfies OwnershipInput
}

const brokerAccount: OwnAccountForMatch = {
  id: 7,
  name: 'Cartera indexada inventada',
  bank: 'Trade Republic',
  texts: ['Trade Republic'],
}

const savingsAccount: OwnAccountForMatch = {
  id: 9,
  name: 'Hucha inventada',
  bank: 'ING',
  texts: ['Hucha Naranja Inventada', 'ING'],
}

describe('own accounts recognition (F62)', () => {
  it('normalizes to lowercase words without accents or punctuation', () => {
    expect(normalizeOwnText('  ANA_PÉREZ_GIL / Señal ')).toBe('ana perez gil senal')
  })

  it('recognizes the holder name and a non-bank text as own, whole words only', () => {
    const movements = [
      movement(1, 'TRANSF /ANA_PEREZ_GIL Nómina cruzada'),
      movement(2, 'Aportación periódica HUCHA NARANJA INVENTADA 0417'),
      movement(3, 'INGRESO EFECTIVO OFICINA 2231'),
      movement(4, 'Recibo gimnasio barrio'),
      // The form with the surnames first.
      movement(5, 'TRANSF PEREZ GIL ANA'),
      // Another person with the SAME two surnames, in both orders: not own, not doubtful.
      movement(6, 'Bizum Lucia Perez Gil cumple'),
      movement(7, 'TRANSF /PEREZ GIL LUCIA'),
      // A first name that ends in the holder's: only the whole form matches.
      movement(8, 'TRANSF /Mariana Perez Gil'),
      movement(9, 'TRANSF PEREZ GIL MARIANA'),
    ]

    const readings = resolveOwnership(
      movements,
      [savingsAccount],
      ['Ana Pérez Gil', 'PEREZ GIL ANA'],
    )

    // Underscores and accents: the form typed with accents matches the description with `_`.
    expect(readings.get(1)).toEqual({
      status: 'own',
      ownAccountId: null,
      ownAccountName: null,
      matchedText: 'Ana Pérez Gil',
      leavesTotals: true,
    })
    expect(readings.get(2)).toEqual({
      status: 'own',
      ownAccountId: 9,
      ownAccountName: 'Hucha inventada',
      matchedText: 'Hucha Naranja Inventada',
      leavesTotals: true,
    })
    // «ing» is a bank text here, and it does not match inside «ingreso» either.
    expect(readings.has(3)).toBe(false)
    expect(readings.has(4)).toBe(false)
    expect(readings.get(5)).toMatchObject({ status: 'own', matchedText: 'PEREZ GIL ANA' })
    for (const id of [6, 7, 8, 9]) expect(readings.has(id), `movement ${id}`).toBe(false)
    expect(readings.size).toBe(3)
  })

  it('does not recognize a movement by the bank field alone', () => {
    // An own account in ING whose only text is not the bank name.
    const account: OwnAccountForMatch = {
      id: 3,
      name: 'Hucha inventada',
      bank: 'ING',
      texts: ['Hucha Naranja Inventada'],
    }
    const movements = [
      movement(1, 'Transferencia a Lucia Perez Sanz cuenta ING'),
      movement(2, 'Bizum Lucia Perez Sanz cumpleanos'),
    ]

    const readings = resolveOwnership(movements, [account], ['Ana Pérez Gil'])

    expect(readings.size).toBe(0)
  })

  it('leaves as doubtful a movement named only by a bank name', () => {
    const movements = [
      movement(1, 'Transferencia emitida Trade Republic 7731'),
      // «ING» is a text of the savings row, and also the bank of that row.
      movement(2, 'Traspaso saliente ING 0042'),
      // A bank name AND an own text: own, never doubtful.
      movement(3, 'Trade Republic aportacion Hucha Naranja Inventada'),
    ]
    // A text equal to the bank of ANOTHER row is a bank text as well.
    const otherRowBank: OwnAccountForMatch = {
      id: 12,
      name: 'Monedero inventado',
      bank: 'Revolut',
      texts: ['Monedero Azul Inventado'],
    }
    const crossAccount: OwnAccountForMatch = {
      id: 15,
      name: 'Cuenta puente inventada',
      bank: 'Openbank',
      texts: ['Revolut'],
    }

    const readings = resolveOwnership(
      [...movements, movement(4, 'Envio a Revolut ref 5521')],
      [brokerAccount, savingsAccount, otherRowBank, crossAccount],
      ['Ana Pérez Gil'],
    )

    expect(readings.get(1)).toEqual({
      status: 'doubtful',
      ownAccountId: 7,
      ownAccountName: 'Cartera indexada inventada',
      matchedText: 'Trade Republic',
      leavesTotals: false,
    })
    expect(readings.get(2)).toMatchObject({ status: 'doubtful', ownAccountId: 9 })
    expect(readings.get(3)).toEqual({
      status: 'own',
      ownAccountId: 9,
      ownAccountName: 'Hucha inventada',
      matchedText: 'Hucha Naranja Inventada',
      leavesTotals: true,
    })
    expect(readings.get(4)).toEqual({
      status: 'doubtful',
      ownAccountId: 15,
      ownAccountName: 'Cuenta puente inventada',
      matchedText: 'Revolut',
      leavesTotals: false,
    })
  })

  it('never makes doubtful a transfer leg or a marked movement', () => {
    const movements = [
      movement(1, 'Transferencia emitida Trade Republic 7731', { transferId: 'pair-inventado-1' }),
      movement(2, 'Transferencia emitida Trade Republic 8842', { excludedFromTotals: true }),
      // Still own when a text matches: it already left the totals and still does.
      movement(3, 'Aportacion Hucha Naranja Inventada', { transferId: 'pair-inventado-2' }),
    ]

    const readings = resolveOwnership(movements, [brokerAccount, savingsAccount], [])

    expect(readings.has(1)).toBe(false)
    expect(readings.has(2)).toBe(false)
    expect(readings.get(3)).toMatchObject({ status: 'own', leavesTotals: true })
  })

  it('the human decision wins over the recognition', () => {
    const movements = [
      // Matches nothing, and the human says it is his.
      movement(1, 'Recibo gimnasio barrio', { ownershipDecision: 'mine' }),
      // Would be `own` by the holder form, and the human says it is not.
      movement(2, 'TRANSF /ANA PEREZ GIL', { ownershipDecision: 'not_mine' }),
      // Would be doubtful; decided as his.
      movement(3, 'Transferencia emitida Trade Republic 7731', { ownershipDecision: 'mine' }),
    ]

    const readings = resolveOwnership(movements, [brokerAccount], ['Ana Pérez Gil'])

    expect(readings.get(1)).toEqual({
      status: 'mine',
      ownAccountId: null,
      ownAccountName: null,
      matchedText: null,
      leavesTotals: true,
    })
    expect(readings.get(2)).toEqual({
      status: 'not_mine',
      ownAccountId: null,
      ownAccountName: null,
      matchedText: 'Ana Pérez Gil',
      leavesTotals: false,
    })
    expect(readings.get(3)).toEqual({
      status: 'mine',
      ownAccountId: 7,
      ownAccountName: 'Cartera indexada inventada',
      matchedText: 'Trade Republic',
      leavesTotals: true,
    })
  })
})
